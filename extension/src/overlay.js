// Floating overlay UI: shows ranked word suggestions with confidence,
// a learned-word stats view, and a settings panel. Persists collapsed
// state, position, and active tab in localStorage (per-viewer UI
// convenience, distinct from the synced settings/learning data which
// live in chrome.storage.local).

(function (root) {
  "use strict";

  const UI_STATE_KEY = "skribblGuesserUiState";

  let overlayEl = null;
  let tabBodies = {}; // tabName -> body element
  let activeTab = "suggestions";
  let onPickCallback = null;
  let onSettingsChangeCallback = null;
  let onResetLearningCallback = null;

  function loadUiState() {
    try {
      const raw = localStorage.getItem(UI_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveUiState(partial) {
    try {
      const current = loadUiState();
      localStorage.setItem(
        UI_STATE_KEY,
        JSON.stringify(Object.assign({}, current, partial))
      );
    } catch (e) {
      // localStorage unavailable (private mode, etc.) - UI state just
      // won't persist across reloads; not worth surfacing an error for.
    }
  }

  function ensureOverlay(callbacks) {
    onPickCallback = callbacks.onPick;
    onSettingsChangeCallback = callbacks.onSettingsChange;
    onResetLearningCallback = callbacks.onResetLearning;
    if (overlayEl) return overlayEl;

    const uiState = loadUiState();
    activeTab = uiState.activeTab || "suggestions";

    overlayEl = document.createElement("div");
    overlayEl.id = "skribbl-guesser-overlay";
    if (uiState.left != null && uiState.top != null) {
      overlayEl.style.left = `${uiState.left}px`;
      overlayEl.style.top = `${uiState.top}px`;
      overlayEl.style.right = "auto";
    }

    const header = document.createElement("div");
    header.className = "sg-header";
    header.innerHTML = `<span>Scribbly</span>`;
    const toggle = document.createElement("button");
    toggle.className = "sg-toggle";
    const collapsed = !!uiState.collapsed;
    toggle.textContent = collapsed ? "+" : "–";
    if (collapsed) overlayEl.classList.add("sg-collapsed");
    toggle.addEventListener("click", () => {
      overlayEl.classList.toggle("sg-collapsed");
      const isCollapsed = overlayEl.classList.contains("sg-collapsed");
      toggle.textContent = isCollapsed ? "+" : "–";
      saveUiState({ collapsed: isCollapsed });
    });
    header.appendChild(toggle);

    const tabs = document.createElement("div");
    tabs.className = "sg-tabs";
    const tabDefs = [
      ["suggestions", "Suggestions"],
      ["stats", "Stats"],
      ["settings", "Settings"],
    ];
    const tabButtons = {};
    for (const [key, label] of tabDefs) {
      const btn = document.createElement("button");
      btn.className = "sg-tab";
      btn.textContent = label;
      btn.addEventListener("click", () => setActiveTab(key));
      tabs.appendChild(btn);
      tabButtons[key] = btn;
    }

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "sg-body-wrap";
    for (const [key] of tabDefs) {
      const body = document.createElement("div");
      body.className = "sg-body";
      bodyWrap.appendChild(body);
      tabBodies[key] = body;
    }

    function setActiveTab(key) {
      activeTab = key;
      for (const [k] of tabDefs) {
        tabButtons[k].classList.toggle("sg-tab-active", k === key);
        tabBodies[k].style.display = k === key ? "" : "none";
      }
      saveUiState({ activeTab: key });
    }
    setActiveTab(activeTab);

    setStatus("Waiting for a round…");
    renderSettingsPlaceholder();
    renderStatsPlaceholder();

    overlayEl.appendChild(header);
    overlayEl.appendChild(tabs);
    overlayEl.appendChild(bodyWrap);
    document.body.appendChild(overlayEl);

    makeDraggable(overlayEl, header);

    return overlayEl;
  }

  function setStatus(text) {
    const body = tabBodies.suggestions;
    if (!body) return;
    body.innerHTML = "";
    const p = document.createElement("div");
    p.className = "sg-status";
    p.textContent = text;
    body.appendChild(p);
  }

  /**
   * @param {Array<{word: string, weight: number, confidencePct: number}>} ranked
   */
  function setCandidates(ranked) {
    const body = tabBodies.suggestions;
    if (!body) return;
    body.innerHTML = "";
    if (!ranked || ranked.length === 0) {
      setStatus("No matches — check word list.");
      return;
    }
    for (const item of ranked) {
      const btn = document.createElement("button");
      btn.className = "sg-word-btn";

      const label = document.createElement("span");
      label.className = "sg-word-label";
      label.textContent = item.word;
      btn.appendChild(label);

      const pct = Math.round((item.confidencePct || 0) * 100);
      const bar = document.createElement("span");
      bar.className = "sg-confidence-bar";
      const fill = document.createElement("span");
      fill.className = "sg-confidence-fill";
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      btn.appendChild(bar);

      const pctLabel = document.createElement("span");
      pctLabel.className = "sg-confidence-pct";
      pctLabel.textContent = `${pct}%`;
      btn.appendChild(pctLabel);

      btn.addEventListener("click", () => {
        if (onPickCallback) onPickCallback(item.word);
      });
      body.appendChild(btn);
    }
  }

  function renderSettingsPlaceholder() {
    const body = tabBodies.settings;
    if (!body) return;
    body.innerHTML = "";
    const p = document.createElement("div");
    p.className = "sg-status";
    p.textContent = "Loading settings…";
    body.appendChild(p);
  }

  /**
   * @param {Object} settings - current settings values.
   */
  function renderSettings(settings) {
    const body = tabBodies.settings;
    if (!body) return;
    body.innerHTML = "";

    function addToggle(key, label) {
      const row = document.createElement("label");
      row.className = "sg-settings-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!settings[key];
      checkbox.addEventListener("change", () => {
        if (onSettingsChangeCallback) {
          onSettingsChangeCallback({ [key]: checkbox.checked });
        }
      });
      row.appendChild(checkbox);
      row.appendChild(document.createTextNode(" " + label));
      body.appendChild(row);
    }

    function addNumber(key, label, min, max, step) {
      const row = document.createElement("label");
      row.className = "sg-settings-row";
      row.appendChild(document.createTextNode(label + " "));
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(settings[key]);
      input.className = "sg-settings-number";
      input.addEventListener("change", () => {
        const parsed = parseFloat(input.value);
        if (!Number.isFinite(parsed)) return;
        // The min/max HTML attributes don't block a typed-in
        // out-of-range value from firing "change", so clamp explicitly.
        const value = Math.min(max, Math.max(min, parsed));
        input.value = String(value);
        if (onSettingsChangeCallback) {
          onSettingsChangeCallback({ [key]: value });
        }
      });
      row.appendChild(input);
      body.appendChild(row);
    }

    function addSelect(key, label, options) {
      const row = document.createElement("label");
      row.className = "sg-settings-row";
      row.appendChild(document.createTextNode(label + " "));
      const select = document.createElement("select");
      select.className = "sg-settings-select";
      for (const [value, optLabel] of options) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = optLabel;
        opt.selected = settings[key] === value;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        if (onSettingsChangeCallback) {
          onSettingsChangeCallback({ [key]: select.value });
        }
      });
      row.appendChild(select);
      body.appendChild(row);
    }

    addToggle("enabled", "Extension enabled");
    addToggle("autoSubmit", "Auto-submit guesses");
    addSelect("autoPlayMode", "Auto-play mode", [
      ["confident", "Only when confident"],
      ["always", "Always guess top pick"],
    ]);
    addNumber("confidenceThreshold", "Confidence threshold (0-1)", 0, 1, 0.05);
    addNumber("suggestionCount", "Suggestions to show", 1, 20, 1);
    addNumber("maxGuessesPerRound", "Max auto-guesses per round", 0, 20, 1);
    addNumber("guessDelayMs", "Delay before auto-submit (ms)", 0, 5000, 100);

    const resetBtn = document.createElement("button");
    resetBtn.className = "sg-danger-btn";
    resetBtn.textContent = "Reset learned word data";
    resetBtn.addEventListener("click", () => {
      if (onResetLearningCallback) onResetLearningCallback();
    });
    body.appendChild(resetBtn);
  }

  function renderStatsPlaceholder() {
    const body = tabBodies.stats;
    if (!body) return;
    body.innerHTML = "";
    const p = document.createElement("div");
    p.className = "sg-status";
    p.textContent = "Loading stats…";
    body.appendChild(p);
  }

  /**
   * @param {Object<string, number>} learnedCounts - word -> times seen
   */
  function renderStats(learnedCounts) {
    const body = tabBodies.stats;
    if (!body) return;
    body.innerHTML = "";

    const entries = Object.entries(learnedCounts || {}).sort(
      (a, b) => b[1] - a[1]
    );

    const summary = document.createElement("div");
    summary.className = "sg-status";
    summary.textContent = `${entries.length} learned word${entries.length === 1 ? "" : "s"}`;
    body.appendChild(summary);

    if (entries.length === 0) return;

    const list = document.createElement("div");
    list.className = "sg-stats-list";
    for (const [word, count] of entries.slice(0, 25)) {
      const row = document.createElement("div");
      row.className = "sg-stats-row";
      row.textContent = `${word} — ${count}×`;
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function makeDraggable(el, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = `${e.clientX - offsetX}px`;
      el.style.top = `${e.clientY - offsetY}px`;
      el.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      const rect = el.getBoundingClientRect();
      saveUiState({ left: rect.left, top: rect.top });
    });
  }

  root.SkribblOverlay = {
    ensureOverlay,
    setStatus,
    setCandidates,
    renderSettings,
    renderStats,
  };
})(typeof window !== "undefined" ? window : globalThis);
