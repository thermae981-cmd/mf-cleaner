(() => {
  function normText(v) {
    return (v || "").replace(/\u3000/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function normAmount(v) {
    const c = normText(v).replace(/[¥￥,\s]/g, "");
    if (!c) return 0;
    const n = Number(c);
    return Number.isFinite(n) ? n : 0;
  }

  function normDate(v) {
    const t = normText(v).replace(/[.]/g, "/").replace(/-/g, "/");
    const m = t.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    return m ? `${m[1].padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
  }

  function normalizeDescription(v) {
    let t = normText(v)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/（[^）]*）/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[\[\]【】]/g, " ")
      .replace(/楽天市場店|楽天市場|my rakuten|クーポン利用|ポイント利用|期間限定|毎月0と5の付く日/g, " ")
      .replace(/[\/_\-・ー]/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return t.replace(/\s+/g, "");
  }

  function merchantKey(v) {
    const base = normText(v)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/（[^）]*）/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[\[\]【】]/g, " ")
      .replace(/楽天市場店|楽天市場|ラクテンイチバ\d*|my rakuten|クーポン利用|ポイント利用|期間限定|毎月0と5の付く日/g, " ")
      .replace(/[\/_\-・ー]/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    const stopWords = new Set(["公式", "ストア", "利用", "対象", "注文", "商品", "市場"]);
    const parts = base.split(" ").filter(Boolean).filter((p) => !stopWords.has(p));
    let stem = parts[0] || "";
    if (!stem) stem = normalizeDescription(v);
    if (stem.length > 18) stem = stem.slice(0, 18);
    return stem;
  }

  function toBool(v) {
    return ["1", "true", "yes", "y", "on", "対象", "振替", "あり"].includes(normText(v).toLowerCase());
  }

  function day(s) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN;
    return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  }

  function dDiff(a, b) {
    const x = day(a);
    const y = day(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
    return Math.abs(x - y);
  }

  function within(a, b, d) {
    return dDiff(a, b) <= d;
  }

  function prefixMatch(a, b) {
    return !!(a && b && (a.startsWith(b) || b.startsWith(a)));
  }

  function grams(t) {
    const m = new Map();
    if (!t) return m;
    if (t.length === 1) {
      m.set(t, 1);
      return m;
    }
    for (let i = 0; i < t.length - 1; i += 1) {
      const g = t.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  }

  function similarityDiceBigram(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = grams(a);
    const B = grams(b);
    let ov = 0;
    let sa = 0;
    let sb = 0;
    A.forEach((c) => { sa += c; });
    B.forEach((c) => { sb += c; });
    A.forEach((ca, g) => { ov += Math.min(ca, B.get(g) || 0); });
    return sa + sb ? (2 * ov) / (sa + sb) : 0;
  }

  window.MFCleanerNormalize = {
    normText,
    normAmount,
    normDate,
    normalizeDescription,
    merchantKey,
    toBool,
    day,
    dDiff,
    within,
    prefixMatch,
    similarityDiceBigram
  };
})();
