(() => {
  const aliases = {
    date: ["date", "日付", "利用日", "発生日"],
    description: ["description", "内容", "摘要", "明細内容", "店舗名", "利用先"],
    amount: ["amount", "金額", "金額(円)", "金額（円）", "利用金額", "残高"],
    major_category: ["major_category", "大項目", "カテゴリ", "カテゴリー"],
    minor_category: ["minor_category", "中項目", "サブカテゴリ", "サブカテゴリー"],
    account: ["account", "口座", "口座名", "利用カード", "カード", "支払元"],
    memo: ["memo", "メモ", "備考"],
    is_transfer: ["is_transfer", "振替", "振替判定", "transfer"],
    id: ["id", "ID", "識別ID"]
  };

  const canonicalColumns = ["date", "description", "amount", "major_category", "minor_category", "account", "memo", "is_transfer", "id"];
  const previewColumns = ["date", "description", "amount", "major_category", "minor_category", "account", "memo", "is_transfer"];

  function parseLine(line) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "\"") {
        if (inQ && line[i + 1] === "\"") {
          cur += "\"";
          i += 1;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseTsvLine(line) {
    return line.split("\t");
  }

  function detectDelimiter(firstLine) {
    const clean = firstLine.replace(/^\uFEFF/, "");
    const tabs = (clean.match(/\t/g) || []).length;
    const commas = (clean.match(/,/g) || []).length;
    return tabs > commas ? "tsv" : "csv";
  }

  function parseDelimited(text) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
    if (lines.length < 2) return { headers: [], rows: [], detectedFormat: "csv" };
    const detectedFormat = detectDelimiter(lines[0]);
    const parse = detectedFormat === "tsv" ? parseTsvLine : parseLine;
    const headers = parse(lines[0]).map((h, i) => (i === 0 ? h.trim().replace(/^\uFEFF/, "") : h.trim()));
    const rows = lines.slice(1).map((line) => {
      const cells = parse(line);
      const o = {};
      headers.forEach((h, i) => { o[h] = (cells[i] ?? "").trim(); });
      return o;
    });
    return { headers, rows, detectedFormat };
  }

  function scoreDecodedText(text) {
    const first = (text.split(/\r?\n/, 1)[0] || "").trim();
    let score = -((text.match(/\uFFFD/g) || []).length * 5);
    if (first.includes(",")) score += 5;
    ["日付", "内容", "金額", "振替", "ID"].forEach((t) => { if (first.includes(t)) score += 20; });
    return score;
  }

  function decodeCsvBytes(bytes) {
    const candidates = [];
    ["utf-8", "shift_jis"].forEach((enc) => {
      try {
        const text = new TextDecoder(enc).decode(bytes);
        candidates.push({ enc, text, score: scoreDecodedText(text) });
      } catch (_) {}
    });
    if (!candidates.length) throw new Error("CSVのデコードに失敗しました。");
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  async function readCsvFile(file) {
    const b = await file.arrayBuffer();
    return decodeCsvBytes(new Uint8Array(b));
  }

  function srcField(headers, target) {
    const hs = headers.map((h) => h.toLowerCase().trim());
    for (const a of aliases[target]) {
      const i = hs.indexOf(a.toLowerCase());
      if (i >= 0) return headers[i];
    }
    return null;
  }

  function validateColumns(headers) {
    const required = ["date", "description", "amount"];
    const missing = required.filter((col) => !srcField(headers, col));
    if (!missing.length) return;
    const names = missing.map((c) => {
      const example = aliases[c].slice(1, 3).join(", ");
      return `${c} (例: ${example})`;
    });
    throw new Error(`必須カラムが見つかりません: ${names.join(" / ")}`);
  }

  async function parseCsv(file) {
    const decoded = await readCsvFile(file);
    const parsed = parseDelimited(decoded.text);
    validateColumns(parsed.headers);
    return {
      headers: parsed.headers,
      rows: parsed.rows,
      delimiter: parsed.detectedFormat,
      encoding: decoded.enc
    };
  }

  window.MFCleanerCSV = {
    aliases,
    canonicalColumns,
    previewColumns,
    parseLine,
    parseDelimited,
    parseCsv,
    srcField,
    validateColumns
  };
})();
