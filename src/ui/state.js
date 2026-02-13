(() => {
  function createState() {
    return {
      cleanedRows: [],
      baseRows: [],
      baseInfo: null,
      currentGroups: [],
      removedByIndex: new Map(),
      restored: new Set(),
      selectedFile: null,
      hasDirtyData: false,
      previewSortKey: "date",
      previewSortDir: -1,
      undoStack: [],
      redoStack: [],
      maxUndo: 50
    };
  }

  function cloneSet(v) {
    return new Set(v);
  }

  function pushUndo(state) {
    state.undoStack.push(cloneSet(state.restored));
    if (state.undoStack.length > state.maxUndo) state.undoStack.shift();
    state.redoStack = [];
  }

  function canUndo(state) {
    return state.undoStack.length > 0;
  }

  function canRedo(state) {
    return state.redoStack.length > 0;
  }

  function undo(state) {
    if (!canUndo(state)) return false;
    state.redoStack.push(cloneSet(state.restored));
    state.restored = state.undoStack.pop();
    return true;
  }

  function redo(state) {
    if (!canRedo(state)) return false;
    state.undoStack.push(cloneSet(state.restored));
    state.restored = state.redoStack.pop();
    return true;
  }

  function toggleRow(state, sourceIndex, removed) {
    if (removed) state.restored.delete(sourceIndex);
    else state.restored.add(sourceIndex);
  }

  function toggleGroup(state, group) {
    const allRemoved = group.removed.every((r) => !state.restored.has(r.sourceIndex));
    if (allRemoved) group.removed.forEach((r) => state.restored.add(r.sourceIndex));
    else group.removed.forEach((r) => state.restored.delete(r.sourceIndex));
  }

  function setAllRemove(state) {
    state.restored = new Set();
  }

  function setAllRestore(state) {
    state.restored = new Set(state.removedByIndex.keys());
  }

  window.MFCleanerState = {
    createState,
    pushUndo,
    canUndo,
    canRedo,
    undo,
    redo,
    toggleRow,
    toggleGroup,
    setAllRemove,
    setAllRestore
  };
})();
