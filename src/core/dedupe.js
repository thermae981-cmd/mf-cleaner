(() => {
  const N = window.MFCleanerNormalize;

  function typePriority(t) {
    return t === "cross_account_1to2_points" ? 3 : t === "cross_account_1to1" ? 2 : 1;
  }

  function buildGroup(id, type, reason, rows, score, dateDiff, netAmountCalc, debug) {
    const sorted = [...rows].sort((a, b) => a.sourceIndex - b.sourceIndex);
    const keeper = sorted[0];
    const removed = sorted.slice(1);
    keeper.duplicateType = type;
    keeper.duplicateReason = reason;
    keeper.duplicateGroupId = id;
    keeper.duplicateClusterId = id;
    keeper.duplicateScore = 1;
    keeper.isRemovedByDefault = false;
    removed.forEach((r) => {
      r.duplicateType = type;
      r.duplicateReason = reason;
      r.duplicateGroupId = id;
      r.duplicateClusterId = id;
      r.duplicateScore = score;
      r.isRemovedByDefault = true;
    });
    return { groupId: id, type, reason, rows: sorted, keeper, removed, score, dateDiff, netAmountCalc, debug: debug || "" };
  }

  function pick(candidates, used) {
    const out = [];
    [...candidates]
      .sort((a, b) => typePriority(b.type) - typePriority(a.type)
        || a.dateDiff - b.dateDiff
        || b.score - a.score
        || (a.bundleRowCount || 99) - (b.bundleRowCount || 99)
        || a.keeperIndex - b.keeperIndex)
      .forEach((c) => {
        if (c.rowIndices.some((i) => used.has(i))) return;
        c.rowIndices.forEach((i) => used.add(i));
        out.push(c);
      });
    return out;
  }

  function buildSameSourceCandidates(rows, opts) {
    const byAccount = new Map();
    rows.forEach((r) => {
      const arr = byAccount.get(r.account) || [];
      arr.push(r);
      byAccount.set(r.account, arr);
    });

    const candidates = [];
    byAccount.forEach((arr) => {
      const adj = new Map();
      arr.forEach((r) => adj.set(r.sourceIndex, new Set()));

      for (let i = 0; i < arr.length; i += 1) {
        const a = arr[i];
        for (let j = i + 1; j < arr.length; j += 1) {
          const b = arr[j];
          if (Math.abs(a.amount) !== Math.abs(b.amount)) continue;
          const dd = N.dDiff(a.date, b.date);
          if (dd > opts.maxDayDiff) continue;
          if (!N.prefixMatch(a.merchant_key, b.merchant_key)) continue;
          const score = N.similarityDiceBigram(a.normalized_description, b.normalized_description);
          if (score < opts.simThreshold) continue;
          adj.get(a.sourceIndex).add(b.sourceIndex);
          adj.get(b.sourceIndex).add(a.sourceIndex);
        }
      }

      const visited = new Set();
      arr.forEach((r) => {
        if (visited.has(r.sourceIndex)) return;
        const stack = [r.sourceIndex];
        const comp = [];
        while (stack.length) {
          const idx = stack.pop();
          if (visited.has(idx)) continue;
          visited.add(idx);
          comp.push(idx);
          (adj.get(idx) || new Set()).forEach((n) => {
            if (!visited.has(n)) stack.push(n);
          });
        }
        if (comp.length < 2) return;
        const rowsComp = comp.map((idx) => arr.find((x) => x.sourceIndex === idx)).filter(Boolean);
        const keeperIndex = Math.min(...comp);
        const dateDiff = rowsComp.length > 1 ? Math.max(...rowsComp.map((x) => N.dDiff(x.date, rowsComp[0].date))) : 0;
        const scores = rowsComp.slice(1).map((x) => N.similarityDiceBigram(rowsComp[0].normalized_description, x.normalized_description));
        const avgScore = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 1;
        candidates.push({
          type: "same_source",
          reason: "同一口座の重複明細",
          rowIndices: [...comp].sort((a, b) => a - b),
          rows: rowsComp,
          score: avgScore,
          dateDiff,
          bundleRowCount: rowsComp.length,
          keeperIndex,
          netAmountCalc: "-"
        });
      });
    });

    return candidates;
  }

  function detectDuplicates(rows, options) {
    const opts = { simThreshold: 0.9, maxDayDiff: 30, bundleDayWindow: 1, ...options };
    rows.forEach((r, i) => {
      r.sourceIndex = i;
      r.duplicateGroupId = "";
      r.duplicateClusterId = "";
      r.duplicateType = "";
      r.duplicateReason = "";
      r.duplicateScore = 1;
      r.isRemovedByDefault = false;
    });

    const negatives = rows.filter((r) => r.amount < 0 && !r.is_transfer);
    const positives = rows.filter((r) => r.amount > 0 && !r.is_transfer);
    const used = new Set();
    const selected = [];

    const bundleCandidates = [];
    negatives.forEach((marketNeg) => {
      const marketPos = positives.filter((p) =>
        p.account === marketNeg.account
        && N.prefixMatch(p.merchant_key, marketNeg.merchant_key)
        && N.within(p.date, marketNeg.date, opts.bundleDayWindow));
      if (!marketPos.length) return;

      const bundles = [];
      for (let i = 0; i < marketPos.length; i += 1) {
        bundles.push([marketPos[i]]);
        for (let j = i + 1; j < marketPos.length; j += 1) bundles.push([marketPos[i], marketPos[j]]);
      }

      bundles.forEach((bundle) => {
        const negSum = marketNeg.amount;
        const posSum = bundle.reduce((s, p) => s + p.amount, 0);
        const net = Math.abs(negSum + posSum);
        if (!net) return;

        negatives.forEach((card) => {
          if (card.sourceIndex === marketNeg.sourceIndex) return;
          if (card.account === marketNeg.account) return;
          if (!N.prefixMatch(card.merchant_key, marketNeg.merchant_key)) return;
          if (Math.abs(card.amount) !== net) return;
          const members = [marketNeg, ...bundle];
          const dateDiff = Math.min(...members.map((m) => N.dDiff(card.date, m.date)));
          if (dateDiff > opts.maxDayDiff) return;
          const rowIndices = [card.sourceIndex, ...members.map((m) => m.sourceIndex)].sort((a, b) => a - b);
          const uniq = [...new Set(rowIndices)];
          const score = N.similarityDiceBigram(card.normalized_description, marketNeg.normalized_description);
          bundleCandidates.push({
            type: "cross_account_1to2_points",
            reason: `純支出一致: ${negSum} + ${posSum} => ${negSum + posSum}`,
            rowIndices: uniq,
            rows: [card, ...members.filter((m) => m.sourceIndex !== card.sourceIndex)],
            score,
            dateDiff,
            bundleRowCount: members.length,
            keeperIndex: Math.min(...uniq),
            cardIndex: card.sourceIndex,
            netAmountCalc: `${negSum} + ${posSum} => ${negSum + posSum}`
          });
        });
      });
    });

    const bestByCard = new Map();
    bundleCandidates.forEach((c) => {
      const prev = bestByCard.get(c.cardIndex);
      if (!prev) {
        bestByCard.set(c.cardIndex, c);
        return;
      }
      const better = c.dateDiff < prev.dateDiff
        || (c.dateDiff === prev.dateDiff && c.score > prev.score)
        || (c.dateDiff === prev.dateDiff && c.score === prev.score && (c.bundleRowCount || 99) < (prev.bundleRowCount || 99))
        || (c.dateDiff === prev.dateDiff && c.score === prev.score && (c.bundleRowCount || 99) === (prev.bundleRowCount || 99) && c.keeperIndex < prev.keeperIndex);
      if (better) bestByCard.set(c.cardIndex, c);
    });
    selected.push(...pick([...bestByCard.values()], used));

    const pairCandidates = [];
    const negRemain = negatives.filter((r) => !used.has(r.sourceIndex));
    for (let i = 0; i < negRemain.length; i += 1) {
      const a = negRemain[i];
      for (let j = i + 1; j < negRemain.length; j += 1) {
        const b = negRemain[j];
        if (a.account === b.account) continue;
        if (Math.abs(a.amount) !== Math.abs(b.amount)) continue;
        if (!N.prefixMatch(a.merchant_key, b.merchant_key)) continue;
        const dateDiff = N.dDiff(a.date, b.date);
        if (dateDiff > opts.maxDayDiff) continue;
        const idx = [a.sourceIndex, b.sourceIndex].sort((x, y) => x - y);
        pairCandidates.push({
          type: "cross_account_1to1",
          reason: `異口座同額: ${a.amount} vs ${b.amount}`,
          rowIndices: idx,
          rows: [a, b],
          score: N.similarityDiceBigram(a.normalized_description, b.normalized_description),
          dateDiff,
          bundleRowCount: 2,
          keeperIndex: idx[0],
          netAmountCalc: "-"
        });
      }
    }
    selected.push(...pick(pairCandidates, used));

    const sameSourceRows = negatives.filter((r) => !used.has(r.sourceIndex));
    const sameCandidates = buildSameSourceCandidates(sameSourceRows, opts);
    selected.push(...pick(sameCandidates, used));

    const removed = new Set();
    const groups = [];
    const breakdown = { same_source: 0, cross_account_1to1: 0, cross_account_1to2_points: 0 };
    let gid = 1;
    selected.forEach((c) => {
      const g = buildGroup(`dup-${String(gid).padStart(4, "0")}`, c.type, c.reason, c.rows, c.score, c.dateDiff, c.netAmountCalc, c.debug || "");
      g.removed.forEach((r) => removed.add(r.sourceIndex));
      groups.push(g);
      breakdown[c.type] = (breakdown[c.type] || 0) + 1;
      gid += 1;
    });

    return {
      keptRows: rows.filter((r) => !removed.has(r.sourceIndex)),
      duplicateGroups: groups,
      stats: {
        duplicateCandidateGroups: groups.length,
        duplicateRemovedRows: removed.size,
        duplicateTypeBreakdown: breakdown,
        duplicateRule: "same_source / cross_account_1to1 / cross_account_1to2_points"
      }
    };
  }

  window.MFCleanerDedupe = { detectDuplicates };
})();
