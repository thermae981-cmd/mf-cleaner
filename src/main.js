(() => {
  const CSV = window.MFCleanerCSV;
  const N = window.MFCleanerNormalize;
  const D = window.MFCleanerDedupe;
  const E = window.MFCleanerExport;
  const S = window.MFCleanerState;
  const R = window.MFCleanerRender;

  // Dependency order:
  // normalize -> csv -> dedupe -> export -> state -> render -> main

  let SIM = 0.9;
  let MAX_DAY_DIFF = 30;
  let BUNDLE_DAY_WINDOW = 1;

  const cleanBtn = document.getElementById("cleanBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const downloadFormatEl = document.getElementById("downloadFormat");
  const statusEl = document.getElementById("status");
  const statsEl = document.getElementById("stats");
  const dupPanel = document.getElementById("dupPanel");
  const dupSummary = document.getElementById("dupSummary");
  const dupBody = document.getElementById("dupBody");
  const previewBody = document.getElementById("previewBody");
  const previewSummary = document.getElementById("previewSummary");
  const previewHead = document.getElementById("previewHead");
  const fSearch = document.getElementById("fSearch");
  const fFrom = document.getElementById("fFrom");
  const fTo = document.getElementById("fTo");
  const fMin = document.getElementById("fMin");
  const fMax = document.getElementById("fMax");
  const fState = document.getElementById("fState");
  const allRemove = document.getElementById("allRemove");
  const allRestore = document.getElementById("allRestore");
  const filterReset = document.getElementById("filterReset");
  const dropZone = document.getElementById("dropZone");
  const csvFileEl = document.getElementById("csvFile");
  const fileNameEl = document.getElementById("fileName");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const paramsToggle = document.getElementById("paramsToggle");
  const paramsPanel = document.getElementById("paramsPanel");
  const paramSim = document.getElementById("paramSim");
  const paramMaxDayDiff = document.getElementById("paramMaxDayDiff");
  const paramBundleWindow = document.getElementById("paramBundleWindow");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const undoInfo = document.getElementById("undoInfo");
  const dupSectionHeader = document.getElementById("dupSectionHeader");
  const dupSectionBody = document.getElementById("dupSectionBody");
  const dupToggleIcon = document.getElementById("dupToggleIcon");
  const previewSectionHeader = document.getElementById("previewSectionHeader");
  const previewSectionBody = document.getElementById("previewSectionBody");
  const previewToggleIcon = document.getElementById("previewToggleIcon");

  const state = S.createState();

  function updateUndoUI() {
    undoBtn.disabled = !S.canUndo(state);
    redoBtn.disabled = !S.canRedo(state);
    undoInfo.textContent = state.undoStack.length ? `(History: ${state.undoStack.length})` : "";
  }

  function showLoading(msg) {
    const textEl = loadingOverlay.querySelector(".loading-text");
    if (textEl) textEl.textContent = msg || "Processing...";
    loadingOverlay.classList.add("active");
    cleanBtn.disabled = true;
  }

  function hideLoading() {
    loadingOverlay.classList.remove("active");
    cleanBtn.disabled = false;
  }

  function readParams() {
    const s = Number(paramSim.value);
    SIM = Number.isFinite(s) && s >= 0 && s <= 1 ? s : 0.9;
    const d = Number(paramMaxDayDiff.value);
    MAX_DAY_DIFF = Number.isFinite(d) && d >= 0 ? Math.round(d) : 30;
    const b = Number(paramBundleWindow.value);
    BUNDLE_DAY_WINDOW = Number.isFinite(b) && b >= 0 ? Math.round(b) : 1;
  }

  function setupCollapsible(header, body, icon) {
    header.addEventListener("click", () => {
      const closing = !body.classList.contains("collapsed");
      if (closing) {
        body.style.maxHeight = `${body.scrollHeight}px`;
        requestAnimationFrame(() => {
          body.classList.add("collapsed");
          body.style.maxHeight = "0";
        });
        icon.textContent = ">";
      } else {
        body.classList.remove("collapsed");
        body.style.maxHeight = `${body.scrollHeight}px`;
        body.addEventListener("transitionend", function handler() {
          body.removeEventListener("transitionend", handler);
          body.style.maxHeight = "";
        });
        icon.textContent = "v";
      }
    });
  }

  setupCollapsible(dupSectionHeader, dupSectionBody, dupToggleIcon);
  setupCollapsible(previewSectionHeader, previewSectionBody, previewToggleIcon);

  paramsToggle.addEventListener("click", () => {
    const open = paramsPanel.classList.toggle("open");
    paramsToggle.textContent = open ? "Advanced Settings ^" : "Advanced Settings v";
  });

  function handleFile(file) {
    if (!file) return;
    state.selectedFile = file;
    fileNameEl.textContent = file.name;
    const dt = new DataTransfer();
    dt.items.add(file);
    csvFileEl.files = dt.files;
  }

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && (/\.(csv|tsv)$/i.test(file.name) || file.type === "text/csv" || file.type === "text/tab-separated-values")) {
      handleFile(file);
    } else {
      statusEl.textContent = "Only CSV or TSV files are supported.";
    }
  });

  csvFileEl.addEventListener("change", () => {
    handleFile(csvFileEl.files[0]);
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.hasDirtyData) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  function toNormalizedRows(headers, rawRows) {
    const map = {};
    CSV.canonicalColumns.forEach((c) => { map[c] = CSV.srcField(headers, c); });
    return rawRows.map((raw) => {
      const desc = N.normText(raw[map.description] || "");
      const r = {
        date: N.normDate(raw[map.date] || ""),
        description: desc,
        amount: N.normAmount(raw[map.amount] || ""),
        major_category: N.normText(raw[map.major_category] || ""),
        minor_category: N.normText(raw[map.minor_category] || ""),
        account: N.normText(raw[map.account] || ""),
        memo: N.normText(raw[map.memo] || ""),
        is_transfer: N.toBool(raw[map.is_transfer] || ""),
        id: N.normText(raw[map.id] || ""),
        normalized_description: N.normalizeDescription(desc),
        merchant_key: N.merchantKey(desc),
        sourceIndex: -1,
        duplicateGroupId: "",
        duplicateClusterId: "",
        duplicateType: "",
        duplicateReason: "",
        duplicateScore: 1,
        isRemovedByDefault: false
      };
      if (!r.is_transfer) {
        const mt = `${r.major_category} ${r.minor_category}`.toLowerCase();
        if (mt.includes("振替") || mt.includes("transfer")) r.is_transfer = true;
      }
      return r;
    }).filter((r) => r.date && r.description);
  }

  function runClean(headers, rawRows, opt) {
    CSV.validateColumns(headers);
    const transformed = toNormalizedRows(headers, rawRows);
    const after = transformed.filter((r) => !(opt.dropTransfer && r.is_transfer) && !(opt.dropZeroAmount && r.amount === 0));
    const d = D.detectDuplicates(after, { simThreshold: SIM, maxDayDiff: MAX_DAY_DIFF, bundleDayWindow: BUNDLE_DAY_WINDOW });
    return {
      rows: d.keptRows,
      duplicateGroups: d.duplicateGroups,
      info: {
        inputRows: rawRows.length,
        normalizedRows: transformed.length,
        afterFilterRows: after.length,
        outputRows: d.keptRows.length,
        duplicateCandidateGroups: d.stats.duplicateCandidateGroups,
        duplicateRemovedRows: d.stats.duplicateRemovedRows,
        duplicateTypeBreakdown: d.stats.duplicateTypeBreakdown,
        duplicateRule: d.stats.duplicateRule
      }
    };
  }

  function renderAll() {
    const restoredRows = [];
    state.restored.forEach((i) => {
      const r = state.removedByIndex.get(i);
      if (r) restoredRows.push(r);
    });
    state.cleanedRows = [...state.baseRows, ...restoredRows];
    E.sortOutputRows(state.cleanedRows);
    R.renderPreview(previewBody, previewSummary, previewHead, state.cleanedRows, state.previewSortKey, state.previewSortDir);
    downloadBtn.disabled = !state.cleanedRows.length;
    if (state.baseInfo) {
      const activeRemoved = state.removedByIndex.size - state.restored.size;
      R.renderStats(statsEl, { ...state.baseInfo, outputRows: state.baseInfo.outputRows + restoredRows.length, duplicateRemovedRows: activeRemoved });
    }
    R.renderDuplicatePanel({ dupPanel, dupBody, dupSummary, fSearch, fFrom, fTo, fMin, fMax, fState }, state.currentGroups, state.restored);
  }

  previewHead.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-key]");
    if (!th) return;
    const key = th.dataset.key;
    if (state.previewSortKey === key) state.previewSortDir *= -1;
    else {
      state.previewSortKey = key;
      state.previewSortDir = key === "amount" ? -1 : 1;
    }
    if (state.cleanedRows.length) R.renderPreview(previewBody, previewSummary, previewHead, state.cleanedRows, state.previewSortKey, state.previewSortDir);
  });

  [fSearch, fFrom, fTo, fMin, fMax, fState].forEach((el) => {
    el.addEventListener("input", () => R.renderDuplicatePanel({ dupPanel, dupBody, dupSummary, fSearch, fFrom, fTo, fMin, fMax, fState }, state.currentGroups, state.restored));
    el.addEventListener("change", () => R.renderDuplicatePanel({ dupPanel, dupBody, dupSummary, fSearch, fFrom, fTo, fMin, fMax, fState }, state.currentGroups, state.restored));
  });

  filterReset.addEventListener("click", () => {
    fSearch.value = "";
    fFrom.value = "";
    fTo.value = "";
    fMin.value = "";
    fMax.value = "";
    fState.value = "all";
    R.renderDuplicatePanel({ dupPanel, dupBody, dupSummary, fSearch, fFrom, fTo, fMin, fMax, fState }, state.currentGroups, state.restored);
  });

  allRemove.addEventListener("click", () => {
    S.pushUndo(state);
    S.setAllRemove(state);
    updateUndoUI();
    renderAll();
  });

  allRestore.addEventListener("click", () => {
    S.pushUndo(state);
    S.setAllRestore(state);
    updateUndoUI();
    renderAll();
  });

  undoBtn.addEventListener("click", () => {
    if (!S.undo(state)) return;
    updateUndoUI();
    renderAll();
  });

  redoBtn.addEventListener("click", () => {
    if (!S.redo(state)) return;
    updateUndoUI();
    renderAll();
  });

  dupBody.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") return;
    const i = Number(t.dataset.sourceIndex);
    if (!Number.isFinite(i)) return;
    S.pushUndo(state);
    S.toggleRow(state, i, t.checked);
    updateUndoUI();
    renderAll();
  });

  dupBody.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLButtonElement) || t.dataset.action !== "toggle-group") return;
    const g = state.currentGroups.find((x) => x.groupId === t.dataset.groupId);
    if (!g) return;
    S.pushUndo(state);
    S.toggleGroup(state, g);
    updateUndoUI();
    renderAll();
  });

  cleanBtn.addEventListener("click", async () => {
    const file = csvFileEl.files[0];
    if (!file) {
      statusEl.textContent = "Select a CSV/TSV file first.";
      return;
    }

    showLoading("Loading and parsing data...");
    statusEl.textContent = "";
    dupPanel.hidden = true;
    dupBody.textContent = "";
    statsEl.hidden = true;
    state.hasDirtyData = false;
    readParams();
    state.undoStack = [];
    state.redoStack = [];
    updateUndoUI();

    try {
      const parsed = await CSV.parseCsv(file);
      if (!parsed.rows.length) {
        hideLoading();
        statusEl.textContent = "No valid data rows were found.";
        downloadBtn.disabled = true;
        return;
      }
      await new Promise((r) => setTimeout(r, 0));
      const result = runClean(parsed.headers, parsed.rows, {
        dropTransfer: document.getElementById("dropTransfer").checked,
        dropZeroAmount: document.getElementById("dropZeroAmount").checked
      });
      state.baseRows = result.rows;
      state.baseInfo = result.info;
      state.currentGroups = result.duplicateGroups;
      state.removedByIndex = new Map();
      state.restored = new Set();
      state.currentGroups.forEach((g) => g.removed.forEach((r) => state.removedByIndex.set(r.sourceIndex, r)));
      renderAll();
      state.hasDirtyData = true;
      hideLoading();
      const fmtLabel = parsed.delimiter === "tsv" ? "TSV" : "CSV";
      statusEl.textContent = `Done: ${state.cleanedRows.length} rows ready. (format: ${fmtLabel} / encoding: ${parsed.encoding} / SIM=${SIM}, dateDiff=${MAX_DAY_DIFF}d)`;
    } catch (err) {
      hideLoading();
      downloadBtn.disabled = true;
      statusEl.textContent = `Error: ${err.message}`;
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!state.cleanedRows.length) return;
    const format = downloadFormatEl.value || "csv_utf8_bom";
    const payload = E.buildDownloadPayload(state.cleanedRows, format);
    const blob = new Blob([payload.text], { type: payload.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const baseName = state.selectedFile ? state.selectedFile.name.replace(/\.[^.]+$/, "") : "mf";
    a.href = url;
    a.download = `${baseName}-cleaned-${y}${m}.${payload.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    state.hasDirtyData = false;
  });
})();
