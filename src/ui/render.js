(() => {
  const N = window.MFCleanerNormalize;
  const { previewColumns } = window.MFCleanerCSV;

  function fmtAmount(v) {
    if (typeof v !== "number") return String(v);
    return v.toLocaleString("ja-JP");
  }

  function td(text, cls, title) {
    const el = document.createElement("td");
    if (cls) el.className = cls;
    if (title) el.title = title;
    el.textContent = String(text);
    return el;
  }

  function updateSortIndicators(previewHead, sortKey, sortDir) {
    previewHead.querySelectorAll("th").forEach((th) => {
      const ind = th.querySelector(".sort-indicator");
      if (!ind) return;
      const key = th.dataset.key;
      if (key === sortKey) {
        ind.classList.add("active");
        ind.textContent = sortDir === 1 ? " ^" : " v";
      } else {
        ind.classList.remove("active");
        ind.textContent = "";
      }
    });
  }

  function renderPreview(previewBody, previewSummary, previewHead, rows, sortKey, sortDir) {
    const list = [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return cmp * sortDir || a.sourceIndex - b.sourceIndex;
    });

    const frag = document.createDocumentFragment();
    list.forEach((r) => {
      const tr = document.createElement("tr");
      previewColumns.forEach((k) => {
        if (k === "description") tr.appendChild(td(r[k], "desc-cell", String(r[k] ?? "")));
        else if (k === "amount") tr.appendChild(td(fmtAmount(r[k]), "amt-col"));
        else tr.appendChild(td(r[k]));
      });
      frag.appendChild(tr);
    });

    previewBody.textContent = "";
    previewBody.appendChild(frag);
    previewSummary.textContent = `${list.length} rows`;
    updateSortIndicators(previewHead, sortKey, sortDir);
  }

  function formatBreakdown(bd) {
    return `same_source:${bd.same_source || 0} / cross_account_1to1:${bd.cross_account_1to1 || 0} / cross_account_1to2_points:${bd.cross_account_1to2_points || 0}`;
  }

  function renderStats(statsEl, info) {
    statsEl.hidden = false;
    statsEl.textContent = "";

    const grid = document.createElement("div");
    grid.className = "stats-grid";
    const cards = [
      { label: "Input Rows", value: info.inputRows },
      { label: "Normalized", value: info.normalizedRows },
      { label: "After Filter", value: info.afterFilterRows },
      { label: "Duplicate Groups", value: info.duplicateCandidateGroups },
      { label: "Removed Rows", value: info.duplicateRemovedRows },
      { label: "Output Rows", value: info.outputRows }
    ];

    cards.forEach((c) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const v = document.createElement("div");
      v.className = "stat-value";
      v.textContent = c.value;
      const l = document.createElement("div");
      l.className = "stat-label";
      l.textContent = c.label;
      card.appendChild(v);
      card.appendChild(l);
      grid.appendChild(card);
    });
    statsEl.appendChild(grid);

    const extra = document.createElement("div");
    extra.style.cssText = "margin-top:8px;font-size:11px;color:#5f564a;";
    extra.textContent = `Type breakdown: ${formatBreakdown(info.duplicateTypeBreakdown)} / Rule: ${info.duplicateRule}`;
    statsEl.appendChild(extra);
  }

  function matchSearch(r, q) {
    if (!q) return true;
    return `${r.description} ${r.account} ${r.amount} ${r.merchant_key}`.toLowerCase().includes(q);
  }

  function renderDuplicatePanel(els, groups, restored) {
    const { dupPanel, dupBody, dupSummary, fSearch, fFrom, fTo, fMin, fMax, fState } = els;
    if (!groups.length) {
      dupPanel.hidden = false;
      dupSummary.textContent = "No duplicate candidates.";
      dupBody.textContent = "";
      return;
    }

    dupPanel.hidden = false;
    const q = N.normText(fSearch.value).toLowerCase();
    const from = fFrom.value || "";
    const to = fTo.value || "";
    const min = N.normText(fMin.value) === "" ? NaN : Number(fMin.value);
    const max = N.normText(fMax.value) === "" ? NaN : Number(fMax.value);
    const state = fState.value;

    const frag = document.createDocumentFragment();
    let visibleGroups = 0;
    let visibleRows = 0;
    let activeRemoved = 0;

    groups.forEach((g) => {
      const rows = g.removed.filter((r) => {
        const isRemoved = !restored.has(r.sourceIndex);
        if (state === "removed" && !isRemoved) return false;
        if (state === "restored" && isRemoved) return false;
        if (q && !matchSearch(r, q)) return false;
        if (from && r.date < from) return false;
        if (to && r.date > to) return false;
        if (Number.isFinite(min) && r.amount < min) return false;
        if (Number.isFinite(max) && r.amount > max) return false;
        return true;
      });
      if (!rows.length) return;

      visibleGroups += 1;
      visibleRows += rows.length;
      activeRemoved += rows.filter((r) => !restored.has(r.sourceIndex)).length;
      const allRemoved = g.removed.every((r) => !restored.has(r.sourceIndex));

      const h = document.createElement("tr");
      h.className = "group";
      const htd = document.createElement("td");
      htd.colSpan = 7;
      htd.textContent = `${g.groupId}  ${g.reason} `;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.action = "toggle-group";
      btn.dataset.groupId = g.groupId;
      btn.textContent = allRemoved ? "Restore Group" : "Remove Group";
      htd.appendChild(btn);
      h.appendChild(htd);
      frag.appendChild(h);

      const keeper = document.createElement("tr");
      keeper.className = "keeper";
      keeper.appendChild(td(g.keeper.date));
      keeper.appendChild(td(g.keeper.description, "desc-cell", g.keeper.description));
      keeper.appendChild(td(fmtAmount(g.keeper.amount), "amt-col"));
      keeper.appendChild(td(g.keeper.account));
      keeper.appendChild(td("Kept"));
      keeper.appendChild(td(g.dateDiff));
      keeper.appendChild(td(g.type === "cross_account_1to2_points" ? g.netAmountCalc : "-"));
      frag.appendChild(keeper);

      rows.forEach((r) => {
        const isRemoved = !restored.has(r.sourceIndex);
        const tr = document.createElement("tr");
        tr.appendChild(td(r.date));
        tr.appendChild(td(r.description, "desc-cell", r.description));
        tr.appendChild(td(fmtAmount(r.amount), "amt-col"));
        tr.appendChild(td(r.account));
        tr.appendChild(td(r.duplicateReason));
        tr.appendChild(td(g.dateDiff));
        const actionTd = document.createElement("td");
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.sourceIndex = String(r.sourceIndex);
        cb.checked = isRemoved;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" Remove as duplicate"));
        actionTd.appendChild(label);
        tr.appendChild(actionTd);
        frag.appendChild(tr);
      });
    });

    dupBody.textContent = "";
    dupBody.appendChild(frag);
    dupSummary.textContent = `${visibleGroups} groups / ${visibleRows} shown / ${activeRemoved} active removed`;
  }

  window.MFCleanerRender = { fmtAmount, updateSortIndicators, renderPreview, renderStats, renderDuplicatePanel };
})();
